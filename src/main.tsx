import React from "react";
import ReactDOM from "react-dom/client";
// Inter empacotada no app (sem internet); o subconjunto "latin" cobre os acentos do português
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./App.css";
import App from "./App";

// Sem o menu de navegador (Voltar, Recarregar…) no botão direito; campos de texto mantêm copiar/colar.
document.addEventListener("contextmenu", (e) => {
  if (!(e.target as HTMLElement).closest("input, textarea")) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
