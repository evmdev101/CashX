import { createRoot } from "react-dom/client";
import { MintExperience } from "./MintExperience";
import "./globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element was not found.");
}

createRoot(root).render(<MintExperience />);
