import { redirect } from "next/navigation";

export default function Home() {
  const workspaceId = "4fcdda2b-6006-44d8-a87d-6c8b3e768374"; // <-- your dev workspace

  redirect(`/login?workspaceId=${workspaceId}`);
}
