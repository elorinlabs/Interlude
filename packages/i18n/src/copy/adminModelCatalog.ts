export const catalogErrors = {
    syntax: ["JSON 格式有误，请修正后再切换表格或保存。", "Fix the JSON syntax before switching to the table or saving."],
    structure: ["请提供包含 models 数组的对象，每个模型需为一个对象。",
      "Provide an object with a models array containing model objects."],
    empty: ["请至少添加一个模型。", "Add at least one model."],
    name: ["模型标识不能为空或重复，请检查 slug 或 id。", "Each model needs a unique, non-empty slug or id."],
    hidden: ["请至少保留一个可见模型。", "Keep at least one model visible."],
  };
