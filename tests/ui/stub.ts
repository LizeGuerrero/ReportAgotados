// @ts-nocheck
export const llamadas: { fn: string; args: any }[] = [];
export const respuestas: Record<string, any> = {};
export function createClient() {
  return {
    rpc: (fn: string, args: any) => {
      llamadas.push({ fn, args });
      const r = respuestas[fn];
      return Promise.resolve(typeof r === 'function' ? r(args) : (r ?? { data: null, error: null }));
    },
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
  };
}
