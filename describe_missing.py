import os
import sqlite3
import base64
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
import subprocess

# ==== CONFIGURAÇÕES ====
STICKER_FOLDER = "/mnt/nas/Media/Figurinhas"
DB_PATH = "./db.sqlite"
IS_NSFW_SCRIPT = "/opt/sticker-bot/is_nsfw.py"

# ==== INICIALIZAÇÃO ====
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ==== CONECTAR AO BANCO ====
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# ==== SELECIONAR FIGURINHAS SEM DESCRIÇÃO ====
cursor.execute("SELECT id, filename FROM stickers WHERE description IS NULL")
stickers = cursor.fetchall()
print(f"🔍 {len(stickers)} figurinhas sem descrição.")

# ==== FUNÇÃO DE IA ====
def gerar_descricao(path):
    with open(path, "rb") as f:
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
    return response.choices[0].message.content.strip()

# ==== CHECAGEM NSFW COM SCRIPT EXTERNO ====
def is_nsfw_image(path):
    try:
        result = subprocess.run(["python3", IS_NSFW_SCRIPT, path], cwd="/opt/sticker-bot")
        return result.returncode == 1  # 1 = NSFW
    except Exception as e:
        print(f"⚠️ Erro na checagem NSFW: {e}")
        return False

# ==== LOOP DE PROCESSAMENTO ====
for sticker_id, filename in stickers:
    caminho = os.path.join(STICKER_FOLDER, filename)

    if not os.path.exists(caminho):
        print(f"⚠️ Arquivo não encontrado: {filename}")
        continue

    # NSFW Check
    if is_nsfw_image(caminho):
        print(f"❌ NSFW detectado em {filename}")
        cursor.execute("UPDATE stickers SET description = ? WHERE id = ?", ("[Conteúdo NSFW filtrado]", sticker_id))
        conn.commit()
        continue

    # Descrição via IA
    try:
        descricao = gerar_descricao(caminho)
        if descricao:
            cursor.execute("UPDATE stickers SET description = ? WHERE id = ?", (descricao, sticker_id))
            conn.commit()
            print(f"✅ {filename}: {descricao}")
    except Exception as e:
        print(f"❌ Erro na IA ao processar {filename}: {e}")

conn.close()
