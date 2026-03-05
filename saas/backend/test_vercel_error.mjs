import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

async function test() {
  try {
    const openai = createOpenAI({ apiKey: "sk-invalid-key-12345" });
    const result = streamText({
      model: openai('gpt-4o-mini'),
      prompt: 'Say hello',
    });

    const response = result.toTextStreamResponse();
    console.log("Status:", response.status);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (value) text += decoder.decode(value);
      if (done) break;
    }
    console.log("Stream text:", text);
  } catch (e) {
    console.error("Caught error:", e);
  }
}
await test();
