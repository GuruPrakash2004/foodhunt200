import "@fontsource/unbounded/700.css";
import "@fontsource/unbounded/400.css";
import "@fontsource-variable/manrope";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Curtain from "./components/motion/Curtain.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")).render(<><Curtain /><App /></>);
