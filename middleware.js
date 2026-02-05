export default function middleware(request) {
  const response = request.clone();
  
  if (request.nextUrl.pathname === '/' || request.nextUrl.pathname.endsWith('index.html')) {
    const apiKey = process.env.API_KEY_SECRET || '';
    const clonedResponse = response.clone();
    
    return new Response(
      clonedResponse.body.then(body => {
        let text = body.toString();
        text = text.replace("window.API_KEY = 'REPLACE_WITH_ENV_VAR';", `window.API_KEY = '${apiKey}';`);
        return new TextEncoder().encode(text);
      }),
      {
        status: clonedResponse.status,
        statusText: clonedResponse.statusText,
        headers: clonedResponse.headers
      }
    );
  }

  return response;
}

export const config = {
  matcher: ['/', '/index.html']
};
