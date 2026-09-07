import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if api_key is None:
    raise ValueError("GEMINI_API_KEY not found.")

genai.configure(api_key=api_key)

model = genai.GenerativeModel("gemini-3.6-flash")

try:
    response = model.generate_content("Say Hello")

    print("SUCCESS!")
    print(response.text)

except Exception as e:
    print("ERROR!")
    print(e)