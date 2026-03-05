import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

async function test() {
  const openai = createOpenAI({ apiKey: "sk-invalid-key-12345" });
  try {
    const result = streamText({
      model: openai('gpt-4o-mini'),
      prompt: 'Say hello',
    });

    const response = result.toTextStreamResponse();
    const text = await response.text();
    console.log("Returned text:", text);
    console.log("Text length:", text.length);
  } catch (e) {
    console.error("Caught error in streamText:", e);
  }
}
test();
