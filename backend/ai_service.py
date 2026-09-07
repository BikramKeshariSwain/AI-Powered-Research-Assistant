import os

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if api_key is None:
    raise ValueError("GEMINI_API_KEY not found.")

genai.configure(api_key=api_key)

model = genai.GenerativeModel("gemini-3.6-flash")


def generate_summary(text: str):
    prompt = f"""
You are an AI Research Assistant.

Generate a concise summary of the following document.

Document:
{text}
"""

    response = model.generate_content(prompt)

    return response.text

def generate_chat_response(document_text: str, user_question: str):
    prompt = f"""
You are an AI Research Assistant.

Answer the user's question using the information available in the document.

Important rules:
1. Carefully search the entire document before answering.
2. If the document contains the answer, provide it clearly.
3. Do not require the exact wording of the user's question to appear in the document.
4. If only part of the answer is available, provide the available information and clearly mention what is missing.
5. Do not invent or assume information that is not supported by the document.
6. If the document truly does not contain enough information to answer, say:
"I couldn't find enough information in the uploaded document."

Document:
{document_text}

User Question:
{user_question}
"""

    response = model.generate_content(prompt)

    return response.text