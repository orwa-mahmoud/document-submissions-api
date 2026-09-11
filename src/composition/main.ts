import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

app.listen(port, () => {
  console.log(`listening on ${port}`);
});
