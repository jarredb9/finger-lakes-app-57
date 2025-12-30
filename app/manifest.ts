import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finger Lakes Winery Visit Planner",
    short_name: "FLX Winery",
    description: "Plan and track your visits to wineries in the Finger Lakes region.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c2d12",
    icons: [
      {
        src: "/placeholder-logo.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/placeholder-logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
