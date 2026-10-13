import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";
import type { CredentialsEmailResult } from "./credentialsEmail";
import { studentApi } from "./studentApi";
import { supervisorManagementApi } from "./supervisorManagementApi";

/**
 * The one coordinator action that applies to a User account regardless of
 * role (student or supervisor — never coordinator, see the server's
 * `resendLogin`), so it gets its own tiny slice rather than living in
 * `studentApi`/`supervisorManagementApi`.
 */
export interface ResendLoginResponse {
  id: string;
  name: string;
  username: string | null;
  email: string;
  credentialsEmail: CredentialsEmailResult;
  /**
   * Present **only** when the email was not sent, so the coordinator can hand
   * the new password over instead. Shown once; never persisted or logged.
   */
  temporaryPassword?: string;
}

export const userManagementApi = createApi({
  reducerPath: "userManagementApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: [],
  endpoints: (builder) => ({
    /**
     * "Resend login": replaces the account's password with a new generated
     * one and emails it. `userId` is the User row's id
     * (`Student.userId`/`CoordinatorSupervisor.userId`), not the
     * student/supervisor profile id.
     */
    resendLogin: builder.mutation<ResendLoginResponse, string>({
      query: (userId) => ({
        url: `/coordinator/users/${userId}/resend-login`,
        method: "POST",
      }),
      // Each list's "Login email" column reads the status this just rewrote,
      // and those lists live in two other slices.
      async onQueryStarted(_userId, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(studentApi.util.invalidateTags(["Student"]));
          dispatch(
            supervisorManagementApi.util.invalidateTags([
              "CoordinatorSupervisor",
            ]),
          );
        } catch {
          // Resend failed — nothing changed to refetch.
        }
      },
    }),
  }),
});

export const { useResendLoginMutation } = userManagementApi;
