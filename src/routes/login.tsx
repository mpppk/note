import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/login")({
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (session.data) {
			throw redirect({ to: "/orgs" });
		}
	},
	component: LoginPage,
});

function LoginPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isPending, setIsPending] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setIsPending(true);
		const result = await authClient.signIn.email({ email, password });
		setIsPending(false);
		if (result.error) {
			setError(result.error.message ?? "Sign in failed");
		} else {
			await router.navigate({ to: "/orgs" });
		}
	};

	return (
		<main className="mx-auto max-w-sm px-4 py-20">
			<h1 className="mb-6 text-2xl font-bold">Sign in</h1>
			<form onSubmit={handleSubmit} className="flex flex-col gap-4">
				<input
					type="email"
					placeholder="Email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					required
					className="rounded border px-3 py-2 text-sm"
				/>
				<input
					type="password"
					placeholder="Password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
					className="rounded border px-3 py-2 text-sm"
				/>
				{error && <p className="text-sm text-red-500">{error}</p>}
				<button
					type="submit"
					disabled={isPending}
					className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				>
					{isPending ? "Signing in..." : "Sign in"}
				</button>
			</form>
		</main>
	);
}
