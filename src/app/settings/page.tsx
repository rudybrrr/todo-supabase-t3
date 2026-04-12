import { redirect } from "next/navigation";

export const metadata = {
    title: "Settings | Stride",
};

export default function SettingsPage() {
    redirect("/tasks?settings=true");
}
