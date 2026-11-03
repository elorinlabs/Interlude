export interface ProjectFile {
  name: string;
  path: string;
  directory: boolean;
  relativePath?: string;
}
export interface ProjectFilesRequest {
  threadId?: string;
  cwd?: string;
  directory?: string;
  imagesOnly?: boolean;
  /** Search names and relative paths recursively instead of browsing one directory. */
  query?: string;
  /** Include dependency, hidden and generated directories when searching the file browser. */
  searchAllDirectories?: boolean;
}
export interface ProjectFilesResponse {
  directory: string;
  parent: string | null;
  entries: ProjectFile[];
  truncated: boolean;
}
