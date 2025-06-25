import { NextResponse } from 'next/server';

/**
 * 空的API端点，用于处理开发模式下的资源请求
 * 避免404错误，返回空响应
 */
export async function GET() {
  return new NextResponse('', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': '0',
    },
  });
}

export async function POST() {
  return new NextResponse('', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': '0',
    },
  });
} 