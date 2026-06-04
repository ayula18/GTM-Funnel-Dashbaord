import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { scrapeHomepage } from '@/lib/pipeline/scraper';
import { extractSignals } from '@/lib/pipeline/signal-extractor';
import { classifyCompany } from '@/lib/pipeline/classifier';

const SYSTEM_PROMPT = `You are Reo's ICP Classifier. Your ONLY purpose is to classify company domains to determine if they are an Ideal Customer Profile (ICP) for Reo.Dev.
Reo.Dev sells to companies whose primary end users are in the engineering function (developers, devops, security, etc. - people who build, ship, run, observe, or secure technical systems).

If the user provides a domain, the system will automatically analyze it before passing it to you.
If the user asks general questions, politely explain that you are an AI designed strictly for ICP classification and ask them to provide a company domain (e.g., 'stripe.com' or 'hubspot.com').
DO NOT answer general knowledge questions, write code, or engage in casual conversation beyond explaining your purpose.`;

// Simple regex to detect if a message contains a domain (e.g., "acme.com", "https://acme.io")
function extractDomain(text: string): string | null {
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i);
  return match ? match[1].toLowerCase() : null;
}

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1].content;
    const domain = extractDomain(lastMessage);

    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({ 
        role: 'assistant', 
        content: 'OpenAI API key is not configured. Please set OPENAI_API_KEY in the environment.' 
      });
    }

    const openai = new OpenAI({ apiKey });

    // If a domain is detected, run the actual pipeline
    if (domain) {
      try {
        const scrapeResult = await scrapeHomepage(domain);
        const html = scrapeResult.html || '';
        const signals = extractSignals(domain, html);
        
        if (scrapeResult.status !== 'success') {
          signals.scrape_status = scrapeResult.status;
        }

        const llmResult = await classifyCompany(signals, apiKey);

        // Format the output beautifully for the chat
        let icpIcon = '❓';
        let icpText = llmResult.is_icp;
        
        if (llmResult.company_classification === 'DevTool' || llmResult.company_classification === 'IT Services & Solutions') {
           icpIcon = '✅';
           icpText = 'Yes';
        } else if (llmResult.company_classification === 'Not Relevant') {
           icpIcon = '❌';
           icpText = 'No';
        }

        const responseContent = `### Analysis for **${llmResult.company_name || domain}** (\`${domain}\`)\n\n**Category:** ${llmResult.company_classification} ${llmResult.category && llmResult.category !== 'Unknown' ? `(${llmResult.category})` : ''}\n**ICP Match:** ${icpIcon} **${icpText}**\n\n**Why?**\n${llmResult.reason}`;

        return NextResponse.json({ role: 'assistant', content: responseContent });
      } catch (err) {
        return NextResponse.json({ 
          role: 'assistant', 
          content: `I tried to analyze \`${domain}\`, but an error occurred: ${(err as Error).message}`
        });
      }
    }

    // If no domain is detected, use LLM to enforce guardrails and politely ask for a domain
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map((m: any) => ({ role: m.role, content: m.content }))
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    return NextResponse.json({ 
      role: 'assistant', 
      content: response.choices[0].message.content || 'Please provide a domain to analyze.' 
    });

  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
