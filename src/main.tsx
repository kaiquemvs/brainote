import React from "react";
import ReactDOM from "react-dom/client";
// Inter empacotada no app (sem internet); o subconjunto "latin" cobre os acentos do português
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./App.css";
import App from "./App";
import { api } from "./api";
import { WidgetApp } from "./Widget";

// Sem o menu de navegador (Voltar, Recarregar…) no botão direito. Campos de texto e o texto da nota
// mantêm o menu do Windows: copiar/colar e as sugestões do corretor ortográfico.
document.addEventListener("contextmenu", (e) => {
  if (!(e.target as HTMLElement).closest("input, textarea, [contenteditable='true']")) e.preventDefault();
});

// Janelas de widget abrem o mesmo app com "#widget=<id>" no endereço.
const widgetId = location.hash.match(/widget=([\w-]+)/)?.[1];

// Lê tema e vidro antes de desenhar, para não piscar o tema errado na abertura.
api.getAppearance().then((look) =>
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      {widgetId ? <WidgetApp id={widgetId} initialLook={look} /> : <App initialLook={look} />}
    </React.StrictMode>,
  ),
);
