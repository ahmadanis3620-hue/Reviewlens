import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Burns roughly the same CPU as a real verification. Called on the "user does
 * not exist" branch of login so the endpoint's response time does not reveal
 * whether an email is registered.
 */
export async function fakeVerify(): Promise<void> {
  await bcrypt.compare(
    "reputeiq-dummy-password",
    "$2b$12$C6UzMDM.H6dfI/f/IKcEeO3ZQm1XoJqxOZWEuDyBhCk1cFVJ8jHzq",
  );
}
