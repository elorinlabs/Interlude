import { initializeTheme } from './theme/preference';
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { App as AntApp } from "antd";
import { WebLocaleProvider } from './i18n/WebLocaleProvider';
import App from "./App";
import { ApplicationTypography } from '../../../shared/appearance/ApplicationTypography';
import { installBrowserDefaultsGuard } from '../../../shared/browser/installBrowserDefaultsGuard';
import { DESKTOP_QUERY } from './useDesktopLayout';
import { StartupUpdatePrompt } from './update/StartupUpdatePrompt';
import { store } from "./store";
import "antd/dist/reset.css";
import "antd-mobile/es/global";
import "./styles.css";

initializeTheme();
const desktopLayout = window.matchMedia(DESKTOP_QUERY);
const stopBrowserDefaultsGuard = installBrowserDefaultsGuard(() => desktopLayout.matches);
if (import.meta.hot) import.meta.hot.dispose(stopBrowserDefaultsGuard);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ApplicationTypography>
        <WebLocaleProvider><AntApp><App /><StartupUpdatePrompt /></AntApp></WebLocaleProvider>
      </ApplicationTypography>
    </Provider>
  </React.StrictMode>,
);
