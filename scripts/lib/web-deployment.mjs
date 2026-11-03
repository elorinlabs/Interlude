import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const SERVICE = "web";
const FILES_LABEL = "com.docker.compose.project.config_files";
const INSPECTION_TIMEOUT_MS = 30_000;
const UPDATE_TIMEOUT_MS = 180_000;
const HEALTH_TIMEOUT_SECONDS = 60;

function capture(arguments_, timeout = INSPECTION_TIMEOUT_MS) {
  try {
    return execFileSync("docker", arguments_, { encoding: "utf8", timeout, stdio: "pipe" }).trim();
  } catch {
    // Docker errors can contain values expanded from private environment files.
    throw new Error("Web 部署检查失败，请检查 Docker、镜像和部署配置。");
  }
}

function readJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("无法读取 Web 部署状态，请检查 Docker 后重试。");
  }
}

export function parseOptions(input) {
  const { values } = parseArgs({
    args: input.arguments_,
    options: {
      "project-name": { type: "string" },
      "env-file": { type: "string" },
      file: { type: "string", multiple: true, default: [] },
      "force-recreate": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) return { help: true };
  if (!["check", "up", "verify"].includes(input.action)) throw new Error("操作必须是 check、up 或 verify。");
  if (!values["project-name"]) throw new Error("请用 --project-name 指定现有 Web 的 Compose 项目名。");
  if (values["force-recreate"] && input.action !== "up") throw new Error("--force-recreate 只能用于 up。");
  return { ...values, action: input.action, root: resolve(input.repository, "apps/web") };
}

function composeFiles(options, previous) {
  const base = resolve(options.root, "compose.yml");
  const recorded = previous?.Config?.Labels?.[FILES_LABEL];
  const files = recorded ? recorded.split(",").map((path) => resolve(path)) : [base];
  const override = resolve(options.root, "compose.override.yml");
  if (!recorded && existsSync(override)) files.push(override);
  for (const path of options.file.map((file) => resolve(file))) {
    if (!files.includes(path)) files.push(path);
  }
  if (!files.includes(base)) throw new Error("该项目未使用当前 Web 配置，请核对项目名和仓库位置。");
  if (files.some((file) => !existsSync(file))) throw new Error("Web 正在使用的配置文件缺失，请先恢复文件。");
  return files;
}

function composeCommand(options, files) {
  const command = ["compose", "--project-name", options["project-name"]];
  const envFile = options["env-file"] ? resolve(options["env-file"]) : resolve(options.root, ".env");
  if (options["env-file"] || existsSync(envFile)) command.push("--env-file", envFile);
  for (const file of files) command.push("-f", file);
  return command;
}

/** Update only the existing Web service, retaining its complete Compose configuration. */
export class WebDeployment {
  constructor(options, run = capture) {
    this.options = options;
    this.run = run;
    this.previous = this.container();
    this.files = composeFiles(options, this.previous);
    this.command = composeCommand(options, this.files);
    this.config = readJson(run([...this.command, "config", "--format", "json"]));
    this.validate();
  }

  container() {
    const ids = this.run([
      "ps", "--all", "--quiet", "--filter", `label=com.docker.compose.project=${this.options["project-name"]}`,
      "--filter", `label=com.docker.compose.service=${SERVICE}`,
    ]).split(/\s+/).filter(Boolean);
    if (ids.length > 1) throw new Error("该项目中有多个 Web 容器，请先核对部署状态。");
    return ids.length ? readJson(this.run(["inspect", ids[0]]))[0] : undefined;
  }

  validate() {
    const service = this.config.services?.[SERVICE];
    const gateway = this.config.networks?.kong;
    if (!service?.image || !service.networks?.kong || !gateway?.external || !gateway.name) {
      throw new Error("Web 配置需要指定镜像，并连接现有 Kong 网络。");
    }
    this.imageId = this.run(["image", "inspect", service.image, "--format", "{{.Id}}"]);
    if (!this.imageId) throw new Error("找不到 Web 镜像，请先构建或加载已验证的镜像。");
  }

  verify() {
    const current = this.container();
    if (!current?.State?.Running || current.State.Health?.Status !== "healthy") {
      throw new Error("Web 尚未通过健康检查，请检查容器状态并按部署记录回滚。");
    }
    if (current.Image !== this.imageId) throw new Error("Web 运行的镜像与目标镜像不一致。");
    for (const [key, settings] of Object.entries(this.config.services[SERVICE].networks)) {
      const network = current.NetworkSettings?.Networks?.[this.config.networks[key]?.name];
      if (!network || settings.aliases?.some((alias) => !network.Aliases?.includes(alias))) {
        throw new Error("Web 的网络或访问别名与配置不一致。");
      }
    }
  }

  update() {
    const arguments_ = [
      ...this.command, "up", "-d", "--no-deps", "--no-build", "--pull", "never",
      "--wait", "--wait-timeout", String(HEALTH_TIMEOUT_SECONDS),
    ];
    if (this.options["force-recreate"]) arguments_.push("--force-recreate");
    try {
      this.run([...arguments_, SERVICE], UPDATE_TIMEOUT_MS);
    } catch {
      throw new Error("Web 更新未完成，请检查容器状态，并使用已记录的镜像回滚。");
    }
    this.verify();
  }
}

export function deployWeb(input) {
  const options = parseOptions(input);
  if (options.help) {
    console.log("npm run deploy:web -- [check|up|verify] --project-name <现有项目名>");
    console.log("可选：--env-file <文件>、--file <覆盖文件>（可重复）、--force-recreate（仅 up）");
    console.log("默认 up；请先构建并加载镜像。check 和 verify 只检查，不更新服务。");
    return;
  }
  const deployment = new WebDeployment(options);
  if (options.action === "up") deployment.update();
  if (options.action === "verify") deployment.verify();
  console.log(JSON.stringify({
    action: options.action, project: options["project-name"], composeFiles: deployment.files,
  }));
}
