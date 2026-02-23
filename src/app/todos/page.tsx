import { Suspense } from "react";
import TodosGate from "./todos-gate";
import TodosSkeleton from "./todos-skeleton";

export default function TodosPage() {
  return (
    <Suspense fallback={<TodosSkeleton />}>
      <TodosGate />
    </Suspense>
  );
}
