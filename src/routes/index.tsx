import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { markup } from "@/lib/bilbobus-markup";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bilbobus · Control de horas" },
      {
        name: "description",
        content:
          "Registra jornadas, controla contratos y exporta informes PDF de tus horas en Bilbobus.",
      },
      { property: "og:title", content: "Bilbobus · Control de horas" },
      {
        property: "og:description",
        content:
          "Registra jornadas, controla contratos y exporta informes PDF de tus horas en Bilbobus.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#9e0b12" },
    ],
    links: [{ rel: "stylesheet", href: "/bilbobus/styles.css" }],
  }),
  component: Index,
});

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(src));
    document.head.appendChild(el);
  });
}

function Index() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadScript(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        );
        await loadScript(
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
        );
      } catch {
        /* PDF opcional */
      }
      if (!cancelled) await loadScript("/bilbobus/app.js");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}
