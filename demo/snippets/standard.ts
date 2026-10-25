import { v } from 'valiq-js';

const Login = v.object({ email: v.string().email(), password: v.string().min(8) });

// Any library that accepts a Standard Schema accepts a Valiq schema:
export const result = await Login['~standard'].validate({ email: 'dev@example.com', password: 'hunter22!' });
