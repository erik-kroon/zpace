import { Outlet, createRootRouteWithContext } from "@tanstack/solid-router";

export interface RouterContext {}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return <Outlet />;
}
