import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";

export type SessionResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    username: string | null;
    name: string;
    role: string;
    /** True on a coordinator-issued account until its first change-password. */
    mustChangePassword: boolean;
  };
};

type LoginRequest = {
  /** Username or email — the server matches either. */
  identifier: string;
  password: string;
};

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: [],
  endpoints: (builder) => ({
    login: builder.mutation<SessionResponse, LoginRequest>({
      query: (credentials) => ({
        url: "/auth/login",
        method: "POST",
        body: credentials,
      }),
    }),
    /**
     * Any signed-in user changing their own password — the voluntary Sidebar
     * flow and the forced first-login /change-password page both use this.
     * Returns a fresh session (matching `login`'s shape) since the old
     * token's `mustChangePassword` claim is stale the moment this succeeds.
     */
    changePassword: builder.mutation<
      SessionResponse,
      { currentPassword: string; newPassword: string }
    >({
      query: (body) => ({
        url: "/auth/password",
        method: "PATCH",
        body,
      }),
    }),
    /**
     * The sliding-window half of the 30-minute inactivity timeout (see
     * `features/account/components/IdleSessionManager.tsx`). Trades a
     * still-valid token for a fresh 30-minute one; called on real user
     * activity, never on a timer alone.
     */
    refresh: builder.mutation<SessionResponse, void>({
      query: () => ({
        url: "/auth/refresh",
        method: "POST",
      }),
    }),
  }),
});

export const {
  useLoginMutation,
  useChangePasswordMutation,
  useRefreshMutation,
} = authApi;