// server/services/authService.ts

import { db } from '../db.js';
import { users } from '@college-pickem/shared';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

const saltRounds = 10;

export const registerUser = async (email: string, password: string, fullName: string) => {
  console.log(`[authService] Attempting to register user: ${email}`);
  
  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existingUser) {
    console.log(`[authService] User already exists: ${email}`);
    throw new Error('User with this email already exists.');
  }

  console.log('[authService] User does not exist, proceeding to hash password.');
  const passwordHash = await bcrypt.hash(password, saltRounds);

  try {
    console.log('[authService] Attempting to insert new user into database...');
    const newUserResult = await db.insert(users).values({
      email,
      passwordHash,
      fullName
    }).returning({ id: users.id, email: users.email, fullName: users.fullName });
    
    if (!newUserResult || newUserResult.length === 0) {
      throw new Error('Database insertion did not return the new user.');
    }
    
    console.log(`[authService] Successfully inserted new user with ID: ${newUserResult[0].id}`);
    return newUserResult[0];

  } catch (dbError) {
    // --- THIS IS THE CRITICAL LOG ---
    // This will show us the REAL error coming from Drizzle or the database.
    console.error("!!! DATABASE INSERTION FAILED !!!");
    console.error("Raw Error Object:", dbError);
    // --- END OF CRITICAL LOG ---

    // Re-throw a more generic error to the route handler.
    throw new Error('A database error occurred during registration.');
  }
};

export const loginUser = async (email: string, password: string) => {
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    return null; // User not found
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return null; // Password incorrect
  }
  
  // Return user data but omit the password hash for security
  const { passwordHash, ...userWithoutPassword } = user;
  return userWithoutPassword;
};