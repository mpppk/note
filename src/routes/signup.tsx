import { createFileRoute, redirect, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "#/lib/auth-client";
import { getSession } from "#/server/auth";

export const Route = createFileRoute("/signup")({
	beforeLoad: async () => {
		const session = await getSession();
		if (session) {
			throw redirect({ to: "/orgs" });
		}
	},
	component: SignUpPage,
});

function SignUpPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isPending, setIsPending] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setIsPending(true);
		const result = await authClient.signUp.email({ name, email, password });
		setIsPending(false);
		if (result.error) {
			setError(result.error.message ?? "Sign up failed");
		} else {
			await router.navigate({ to: "/orgs" });
		}
	};

	return (
		<main className="mx-auto max-w-sm px-4 py-20">
			<h1 className="mb-6 text-2xl font-bold">Create account</h1>
			<form onSubmit={handleSubmit} className="flex flex-col gap-4">
				<input
					type="text"
					placeholder="Name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
					className="rounded border px-3 py-2 text-sm"
				/>
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
					{isPending ? "Creating account..." : "Create account"}
				</button>
			</form>
			<p className="mt-4 text-center text-sm text-gray-500">
				Already have an account?{" "}
				<Link to="/login" className="text-blue-600 hover:underline">
					Sign in
				</Link>
			</p>
		</main>
	);
}
