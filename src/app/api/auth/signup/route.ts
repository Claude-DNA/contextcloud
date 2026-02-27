import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, isDbAvailable } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    if (!(await isDbAvailable())) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const { email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const displayName = name || email.split('@')[0];

    const userRes = await query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, passwordHash, displayName]
    );
    const user = userRes.rows[0];

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
