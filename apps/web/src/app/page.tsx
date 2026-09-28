import { ControllerActionSchema } from "@new/shared";
import { apiUrl } from "../env";

const controllerActions = ControllerActionSchema.options;

export default function HomePage() {
  return (
    <main>
      <h1>NEW</h1>
      <p>Phase 1 foundation</p>
      <p>Shared controller actions:</p>
      <ul>
        {controllerActions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
      <p>
        Cloudflare API configuration: {apiUrl ? "configured" : "not configured"}
      </p>
      <p>No renewal analysis, wallet operation, or settlement is active.</p>
    </main>
  );
}
