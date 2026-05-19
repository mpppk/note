import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

const plugins: PluginOption[] = [
	devtools() as unknown as PluginOption,
	cloudflare({ viteEnvironment: { name: "ssr" } }) as unknown as PluginOption,
	tailwindcss() as unknown as PluginOption,
	tanstackStart() as unknown as PluginOption,
	viteReact() as unknown as PluginOption,
];

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins,
});

export default config;
