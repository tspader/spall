import { z } from "zod";

export const FileStatus = z.enum(["added", "modified", "removed", "ok"]);

export type FileStatus = z.infer<typeof FileStatus>;
