import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";

export default async function Home() {
  redirect((await getAuth()) ? "/dashboard" : "/login");
}
