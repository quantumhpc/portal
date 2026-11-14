import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getDb } from "@/lib/db/connection";
import { getDefaultUser } from "@/lib/db/models/user";
import { pamAuthenticate, getSystemUser } from "./pam";
import { config } from "@/lib/config";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error("Username and password are required");
        }

        const { username, password } = credentials;

        // Step 1: PAM authentication (or dev-mode OS user check)
        const ok = await pamAuthenticate(username, password);
        if (!ok) throw new Error("Authentication failed");

        // Step 2: Resolve system identity from OS
        let sysUser;
        try {
          sysUser = getSystemUser(username);
        } catch {
          throw new Error(`No system account found for '${username}'`);
        }

        // Step 3: Look up or auto-provision DB admin record
        const db = await getDb();
        let dbUser = await db.collection("users").findOne({ username });

        if (!dbUser) {
          const isAdmin =
            (config.mainConfig.admin_users as string[]).includes(username) ||
            sysUser.uid === 0;
          const newRecord = getDefaultUser(username);
          newRecord.admin.isAdmin = isAdmin;
          const result = await db.collection("users").insertOne(newRecord);
          dbUser = { _id: result.insertedId, ...newRecord };
        }

        if (!dbUser.admin?.active) {
          throw new Error("Account is not active");
        }

        return {
          id: dbUser._id.toString(),
          username,
          name: dbUser.displayName || username,
          email: dbUser.email || "",
          isAdmin: dbUser.admin?.isAdmin ?? false,
          uid: sysUser.uid,
          gid: sysUser.gid,
          home: sysUser.home,
          shell: sysUser.shell,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = (user as any).username;
        token.isAdmin = (user as any).isAdmin;
        token.uid = (user as any).uid;
        token.gid = (user as any).gid;
        token.home = (user as any).home;
        token.shell = (user as any).shell;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).username = token.username;
        // admin_users is read live, so adding a name in Admin → Configuration takes effect without a restart.
        (session.user as any).isAdmin =
          !!token.isAdmin || (config.mainConfig.admin_users as string[]).includes(token.username as string);
        (session.user as any).uid = token.uid;
        (session.user as any).gid = token.gid;
        (session.user as any).home = token.home;
        (session.user as any).shell = token.shell;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60, // 1 hour
  },
  // Production must set NEXTAUTH_SECRET (enforced in instrumentation.ts).
  secret: process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV === "production" ? undefined : "qhpc-dev-secret-change-in-production"),
};
