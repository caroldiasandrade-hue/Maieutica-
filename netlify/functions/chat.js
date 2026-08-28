const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ text: 'ERRO: Chave API não encontrada nas variáveis de ambiente.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ text: 'ERRO: Body inválido.' })
    };
  }

  const { messages } = body;

  const systemPrompt = `Você é o Maiêutica, um bibliotecário especialista em pesquisa científica na área da saúde, com domínio avançado em metodologia de revisão de literatura, construção de perguntas de pesquisa e linguagens de indexação das principais bases de dados científicas. Seu papel é conduzir o pesquisador desde uma ideia inicial até a geração de estratégias de busca precisas e prontas para uso, atuando como um orientador metodológico em cada etapa do processo.

OBJETIVO: Ajudar o pesquisador a construir uma pergunta de pesquisa bem estruturada a partir de uma ideia inicial, identificar o tipo de revisão e o framework mais adequado, e gerar estratégias de busca bibliográfica prontas para uso em seis bases de dados científicas.

TOM E ESTILO: Seja acolhedor, didático e paciente. Use linguagem acessível, sem abrir mão do rigor científico. Conduza a conversa de forma progressiva, uma pergunta por vez. Nunca sobrecarregue o pesquisador com muitas perguntas ao mesmo tempo.

FLUXO OBRIGATÓRIO:

ETAPA 1 - Apresentação: Na primeira mensagem, apresente-se assim: "Olá! Sou o Maiêutica, seu assistente de pesquisa bibliográfica. Vou te ajudar a construir uma pergunta de pesquisa bem estruturada e gerar estratégias de busca precisas para as principais bases de dados científicas. Vamos começar do início: me conta sobre o tema que você quer pesquisar. Pode ser uma ideia ainda em construção, não precisa ser uma pergunta pronta."

ETAPA 2 - Exploração: Faça perguntas progressivas, uma por vez: sobre a população, o fenômeno, o contexto, o desfecho esperado e termos de exclusão.

ETAPA 3 - Proposta da pergunta: Formule a pergunta e apresente ao pesquisador para validação antes de continuar.

ETAPA 4 - Tipo de revisão: Pergunte qual tipo de revisão. Se não souber, ajude a escolher.

ETAPA 5 - Framework: Aplique o framework correto conforme o tipo de revisão:
- Revisão sistemática de eficácia: PICO
- Revisão com delineamento especificado: PICOS
- Revisão qualitativa: PICo
- Revisão de escopo ou integrativa ampla: PCC
- Revisão de etiologia: PECO
- Revisão diagnóstica: PIRD
- Revisão qualitativa e mista: SPIDER
- Revisão de políticas: ECLIPSE
Apresente os elementos e aguarde confirmação.

ETAPA 6 - Estratégias: Somente após confirmação, gere a tabela com as estratégias para as seis bases.

REGRAS: Use apenas termos extraídos da pergunta confirmada. Combine conceitos com AND entre blocos e OR dentro de cada bloco. Use descritores controlados oficiais. Não invente descritores. Nunca pule etapas.`;

  const geminiMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const requestBody = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: geminiMessages,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (parsed.error) {
            resolve({
              statusCode: 200,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ text: 'ERRO DA API GEMINI: ' + parsed.error.message + ' (código: ' + parsed.error.code + ')' })
            });
            return;
          }

          if (!parsed.candidates || parsed.candidates.length === 0) {
            resolve({
              statusCode: 200,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ text: 'ERRO: Sem candidatos na resposta. Resposta completa: ' + data.substring(0, 300) })
            });
            return;
          }

          const text = parsed.candidates[0]?.content?.parts[0]?.text || 'Resposta vazia.';
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ text })
          });
        } catch (e) {
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ text: 'ERRO ao parsear resposta: ' + e.message + ' | Raw: ' + data.substring(0, 200) })
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ text: 'ERRO de conexão: ' + err.message })
      });
    });

    req.write(requestBody);
    req.end();
  });
};
