import z from "zod";
import { api } from "./api";
import { Store } from "./store";
import { Model } from "./model";
import { Sql } from "./sql";
import { Project } from "./project";

export namespace Note {
  export const Info = z.object({
    id: z.number(),
    project: Project.Id,
    path: z.string(),
  });
  export type Info = z.infer<typeof Info>;

  export const add = api(
    z.object({
      project: Project.Id,
      path: z.string(),
      content: z.string(),
    }),
    async (input): Promise<Info> => {
      const project = await Project.get({ id: input.project });
      const db = Store.get();

      const mtime = Date.now();

      await Model.load();

      // Chunk and embed
      const chunks = await Store.chunk(input.content);

      // Insert note record
      const row = db
        .prepare(Sql.INSERT_NOTE)
        .get(project.id, input.path, input.content, mtime) as { id: number };

      if (chunks.length > 0) {
        // Use note id as the key for embeddings
        const noteKey = `note:${row.id}`;

        // Clear any existing embeddings for this note
        Store.clearEmbeddings(noteKey);

        // Embed all chunks
        const texts = chunks.map((c) => c.text);
        const embeddings = await Model.embedBatch(texts);

        // Store embeddings
        for (let i = 0; i < chunks.length; i++) {
          Store.embed(noteKey, i, chunks[i]!.pos, embeddings[i]!);
        }
      }

      return {
        id: row.id,
        project: project.id,
        path: input.path,
      };
    },
  );
}
