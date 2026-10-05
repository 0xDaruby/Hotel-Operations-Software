import test from "node:test";
import assert from "node:assert/strict";
import { provisionStaff, validateStaffInput } from "./provisioning";

test("rejects invalid input before provisioning", () => {
  for (const value of [
    null,
    {},
    { displayName: "A", email: "bad", role: "owner" },
    { displayName: "", email: "a@b.co", role: "supervisor" },
  ]) {
    assert.throws(() => validateStaffInput(value));
  }
  assert.equal(
    validateStaffInput({
      displayName: "Ada 🌟",
      email: " ADA@example.com ",
      role: "supervisor",
    }).email,
    "ada@example.com",
  );
});
test("compensates newly created auth user when profile creation fails", async () => {
  const calls: string[] = [];
  const result = await provisionStaff(
    { displayName: "Ada", email: "a@b.co", role: "supervisor" },
    {
      createUser: async () => "new",
      createProfile: async () => {
        throw Error("denied");
      },
      deleteUser: async () => {
        calls.push("deleted");
      },
      sendSetup: async () => {
        calls.push("mail");
      },
    },
  );
  assert.equal(result.ok, false);
  assert.deepEqual(calls, ["deleted"]);
});
test("mail failure preserves inactive profile and exposes retry state", async () => {
  const calls: string[] = [];
  const result = await provisionStaff(
    { displayName: "Ada", email: "a@b.co", role: "receptionist" },
    {
      createUser: async () => "new",
      createProfile: async () => {
        calls.push("profile");
      },
      deleteUser: async () => {
        calls.push("deleted");
      },
      sendSetup: async () => {
        throw Error("mail");
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.emailSent, false);
  assert.deepEqual(calls, ["profile"]);
});
test("duplicate auth account is never reassigned or deleted", async () => {
  let mutated = false;
  const result = await provisionStaff(
    { displayName: "Ada", email: "a@b.co", role: "supervisor" },
    {
      createUser: async () => {
        throw Error("duplicate");
      },
      createProfile: async () => {
        mutated = true;
      },
      deleteUser: async () => {
        mutated = true;
      },
      sendSetup: async () => {
        mutated = true;
      },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(mutated, false);
});
test("successful provisioning sends setup after profile and preserves order", async () => {
  const calls: string[] = [];
  const result = await provisionStaff(
    { displayName: "Ada", email: "a@b.co", role: "supervisor" },
    {
      createUser: async () => {
        calls.push("auth");
        return "new";
      },
      createProfile: async () => {
        calls.push("profile");
      },
      deleteUser: async () => {},
      sendSetup: async () => {
        calls.push("mail");
      },
    },
  );
  assert.equal(result.emailSent, true);
  assert.deepEqual(calls, ["auth", "profile", "mail"]);
});
