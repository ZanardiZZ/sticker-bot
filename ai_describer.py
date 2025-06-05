# /opt/sticker-bot/ai_describer.py
import os
import sys
import base64
from openai import OpenAI
from dotenv import load_dotenv
import subprocess

# Inicialização
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

img_path = sys.argv[1]

# NSFW Check via CLIP
def is_nsfw_image(path):
    result = subprocess.run(["python3", "is_nsfw.py", path], cwd="/opt/sticker-bot")
    return result.returncode == 1

if is_nsfw_image(img_path):
    print("[Conteúdo NSFW filtrado]")
    sys.exit(0)

# Gerar descrição com OpenAI
with open(img_path, "rb") as f:
    b64 = base64.b64encode(f.read()).decode("utf-8")

response = client.chat.completions.create(
    model="gpt-4-turbo",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Descreva essa figurinha de forma divertida e curta, como se fosse um meme."},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/webp;base64,{b64}"
                    }
                }
            ]
        }
    ],
    max_tokens=80
)

descricao = response.choices[0].message.content.strip()
print(descricao)
