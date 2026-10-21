#!/usr/bin/env node
// Generate the "Secret Key (for OAuth)" Supabase's Apple provider needs for
// the web Sign in with Apple flow (used by the MCP consent page). It is an
// ES256 JWT signed with a Sign in with Apple key (.p8) from the Apple
// Developer portal; Apple caps its lifetime at 6 months, so rerun this and
// paste the new value into Supabase before it expires.
//
//   node scripts/apple-client-secret.mjs \
//     --team-id ABCDE12345 --key-id XYZ9876543 \
//     --services-id com.adamlincodesexpo.ontrack.web \
//     --key ~/Downloads/AuthKey_XYZ9876543.p8
//
// Prints the JWT to stdout. Never commit the .p8 or the printed secret.
import { readFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
  }, []),
);
const required = ["team-id", "key-id", "services-id", "key"];
const missing = required.filter((k) => !args[k]);
if (missing.length) {
  console.error(`Missing ${missing.map((k) => `--${k}`).join(", ")}`);
  process.exit(1);
}

const b64url = (input) =>
  Buffer.from(input).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = { alg: "ES256", kid: args["key-id"] };
const payload = {
  iss: args["team-id"],
  iat: now,
  exp: now + 60 * 60 * 24 * 180, // 6 months, Apple's maximum
  aud: "https://appleid.apple.com",
  sub: args["services-id"],
};
const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const key = createPrivateKey(readFileSync(args.key.replace(/^~/, process.env.HOME ?? "")));
const signature = sign("sha256", Buffer.from(signingInput), {
  key,
  dsaEncoding: "ieee-p1363",
});
process.stdout.write(`${signingInput}.${signature.toString("base64url")}\n`);
console.error(`Expires ${new Date(payload.exp * 1000).toISOString().slice(0, 10)}`);
