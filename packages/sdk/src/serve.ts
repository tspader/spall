import { Server } from "./server";

const { stopped } = await Server.start();
await stopped;
