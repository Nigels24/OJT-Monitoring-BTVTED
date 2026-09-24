import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQueryWithAuth } from "./baseQuery";

/**
 * The one coordinator action that applies to a User account regardless of
 * role (student or supervisor — never coordinator, see the server's
 * `resetPasswordForUser`), so it gets its own tiny slice rather than living
 * in `studentApi`/`supervisorManagementApi`.
 */
export interface ResetUserPasswordResponse {
  id: string;
  name: string;
  username: string | null;
  /** Plaintext, returned once. Never persisted or logged. */
  temporaryPassword: string;
}

export const userManagementApi = createApi({
  reducerPath: "userManagementApi",
  baseQuery: baseQueryWithAuth,
  tagTypes: [],
  endpoints: (builder) => ({
    /** `userId` is the User row's id (`Student.userId`/`CoordinatorSupervisor.userId`), not the student/supervisor profile id. */
    resetUserPassword: builder.mutation<ResetUserPasswordResponse, string>({
      query: (userId) => ({
        url: `/coordinator/users/${userId}/reset-password`,
        method: "POST",
      }),
    }),
  }),
});

export const { useResetUserPasswordMutation } = userManagementApi;
