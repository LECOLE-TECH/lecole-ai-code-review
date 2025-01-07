import { AIProvider, AIProviderConfig, ReviewRequest, ReviewResponse } from "./AIProvider";

interface CloudflareMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class CloudflareAIProvider implements AIProvider {
  private apiKey: string = "";
  private accountId: string = "";
  private model: string = "";
  private temperature: number = 0.7;

  async initialize(config: AIProviderConfig & { accountId: string }): Promise<void> {
    this.apiKey = config.apiKey;
    this.accountId = config.accountId;
    this.model = config.model;
    this.temperature = config.temperature ?? 0.7;
  }

  async review(request: ReviewRequest): Promise<ReviewResponse> {
    const prompt = this.buildPrompt(request);

    const messages: CloudflareMessage[] = [
      {
        role: "system",
        content: "You are an expert code reviewer. Analyze the code changes and provide detailed feedback."
      },
      {
        role: "user",
        content: prompt
      }
    ];

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ messages, stream: true })
      }
    );

    if (!response.ok) {
      throw new Error(`Cloudflare AI API error: ${response.status} ${response.statusText}`);
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    let fullResponse = "";

    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Convert the Uint8Array to text
          const chunk = new TextDecoder().decode(value);
          fullResponse += chunk;
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Parse the accumulated response
    return this.parseResponse({ result: { response: fullResponse } });
  }

  private buildPrompt(request: ReviewRequest): string {
    // Construct a prompt that includes:
    // 1. Pull request title and description
    // 2. Changed files and their diffs
    // 3. Context files if any
    // 4. Previous reviews if any

    let prompt = `Review the following pull request:\n\n`;
    prompt += `Title: ${request.pullRequest.title}\n`;
    prompt += `Description: ${request.pullRequest.description}\n\n`;

    prompt += `Changed files:\n`;
    for (const file of request.files) {
      prompt += `\nFile: ${file.path}\n`;
      prompt += file.diff || file.content;
    }

    return prompt;
  }

  private parseResponse(result: any): ReviewResponse {
    // Implement parsing logic based on the model's output format
    // This is a simplified example
    return {
      summary: result.result.response,
      lineComments: [], // Parse specific line comments if the model provides them
      suggestedAction: "COMMENT", // Determine based on the response
      confidence: 0.8 // Determine based on the model's confidence signals
    };
  }
}
