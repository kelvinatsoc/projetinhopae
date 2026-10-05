import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./ui/App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);

// service worker: permite instalar no celular e jogar offline
registerSW({ immediate: true });
