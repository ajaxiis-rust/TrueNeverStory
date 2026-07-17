# ハードウェア要件とモデル推奨

TrueNeverStoryは柔軟です — Raspberry PiからマルチGPUサーバーまで、anythingで実行できます。利用可能なハードウェアに応じて構成を選択してください。

---

## 最小要件

| コンポーネント | 最小 | 推奨 |
|----------------|------|------|
| **RAM** | 4 GB | 8+ GB |
| **CPU** | 2コア | 4+コア |
| **ストレージ** | 2 GB | 10+ GB |
| **GPU** | 不要 | VRAM付きGPU |

---

## 構成プロファイル

### プロファイル1: ウルトラライト (2-4 GB RAM)

**ユースケース:** 古いラップトップ、VPS、Raspberry Pi 4+

```
Intent Parser:    Gemma 3 1B (Q4_K_M) — 760 MB
翻訳:             NLLB-200 600M (Q4_K_M) — 340 MB
ナラティブ生成:    クラウドAPI (Gemini Flash)
Embeddings:       ハッシュフォールバック (モデル不要)
```

**合計RAM:** ~1.1 GB  
**速度:** 遅い (CPUで3-5 tok/s)  
**品質:** 受け入れ可能  
**プライバシー:** 部分的 (クラウド経由のナラティブ)

---

### プロファイル2: バランス (4-8 GB RAM)

**ユースケース:** モダンなラップトップ、デスクトップ、小さなサーバー

```
オールインワン:    Llama 3.2 3B (Q4_K_M) — 2 GB
                  または Qwen 2.5 3B (Q4_K_M) — 2 GB
翻訳:             NLLB-200 600M (Q4_K_M) — 340 MB
Embeddings:       BGE M3 (Q4_K_M) — 438 MB
```

**合計RAM:** ~2.8 GB  
**速度:** 普通 (CPUで5-10 tok/s)  
**品質:** 良好  
**プライバシー:** 完全 (すべてローカル)

---

### プロファイル3: 品質 (8-16 GB RAM)

**ユースケース:** ゲーミングPC、ワークステーション、専用サーバー

```
オールインワン:    Gemma 3 4B (Q4_K_M) — 2.3 GB
                  または Qwen 2.5 7B (Q4_K_M) — 4.4 GB
翻訳:             NLLB-200 600M (Q8_0) — 620 MB
Embeddings:       BGE M3 (Q8_0) — 635 MB
```

**合計RAM:** ~3.6-5.5 GB  
**速度:** 良好 (CPUで10-20 tok/s、GPUで30+)  
**品質:** 高い  
**プライバシー:** 完全

---

### プロファイル4: GPU加速 (4+ GB VRAM)

**ユースケース:** GPU付きゲーミングPC、専用GPU付きワークステーション

```
LLM:              Llama 3.1 8B (Q4_K_M) — 5 GB VRAM
翻訳:             同じモデル (多言語)
Embeddings:       BGE M3 (Q8_0) — CPUオフロード
```

**合計VRAM:** ~5 GB  
**速度:** 高速 (30-50 tok/s)  
**品質:** 優秀  
**プライバシー:** 完全

---

## タスク別モデル推奨

### Intent Parser (コマンド認識)

| モデル | サイズ | 速度 | 品質 | 備考 |
|--------|--------|------|------|------|
| Gemma 3 1B | 760 MB | 高速 | ベース | 最小限 |
| Llama 3.2 3B | 2 GB | 普通 | 良好 | 推奨 |
| Gemma 3 4B | 2.3 GB | 普通 | 高い | 最高品質 |

### 翻訳 (多言語)

| モデル | サイズ | 言語 | 速度 | 品質 |
|--------|--------|------|------|------|
| NLLB-200 600M | 340-620 MB | 35+ | 高速 | 良好 |
| MADLAD-400 3B | 2 GB | 400+ | 普通 | 高い |
| Qwen 2.5 3B | 2 GB | 29+ | 普通 | 高い |

### ナラティブ生成 (散文)

| モデル | サイズ | 速度 | 品質 | 備考 |
|--------|--------|------|------|------|
| Gemma 3 1B | 760 MB | 高速 | ベース | ナラティブには弱い |
| Llama 3.2 3B | 2 GB | 普通 | 良好 | ナラティブの最小限 |
| Gemma 3 4B | 2.3 GB | 普通 | 高い | 推奨 |
| Qwen 2.5 7B | 4.4 GB | 遅い | 優秀 | 最高品質 |
| YandexGPT 5 Lite 8B | 4.9 GB | 遅い | 優秀 | RUテキストに最適 |

### Embeddings (セマンティック検索)

| モデル | サイズ | 次元 | 品質 |
|--------|--------|------|------|
| Embedding Gemma 300M | 329 MB | 768 | ベース |
| BGE M3 (Q4_K_M) | 438 MB | 1024 | 良好 |
| BGE M3 (Q8_0) | 635 MB | 1024 | 高い |
| Qwen3 Embedding 0.6B | 639 MB | 1024 | 高い |

---

## 構成例

### 例1: 予算VPS (4 GB RAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.2:3b

# Ollama設定
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=2
```

**モデルのインストール:**
```bash
ollama pull llama3.2:3b
ollama pull nllb-200-distilled-600m
```

---

### 例2: GPU付きデスクトップ (8 GB VRAM)

```bash
# .env
WORLD_LLM_BASE_URL=http://localhost:11434/v1
WORLD_LLM_MODEL=llama3.1:8b
WORLD_EMBEDDING_MODEL=bge-m3
WORLD_EMBEDDING_BASE_URL=http://localhost:5002
```

---

### 例3: クラウドハイブリッド

```bash
# .env — クラウド経由のナラティブ
WORLD_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
WORLD_LLM_MODEL=gemini-2.0-flash
WORLD_LLM_API_KEY=your-key

# 翻訳用ローカル (プライバシー)
OLLAMA_NUM_PARALLEL=1
```

**エージェント設定で:**
- Narrator → Google Gemini (クラウド)
- Translation → Ollama NLLB-200 (ローカル)
- Intent Parser → Ollama Llama 3.2 3B (ローカル)

---

## パフォーマンスのヒント

1. **CPUのみ:** 速度/品質比が最良のQ4_K_M量子化を使用
2. **GPU:** VRAMが許すなら、より良い品質のためにQ5_K_MまたはQ8_0
3. **並列リクエスト:** CPUで`WORLD_LLM_MAX_CONCURRENT=1`を設定
4. **Embeddings:** RAMが不足している場合はハッシュフォールバックを使用 (Embeddingモデルを無効化)
5. **翻訳:** NLLB-200は翻訳用に最適化されており、一般的なチャット用ではない

---

## 言語サポート

| モデル | 言語 | 最適用途 |
|--------|------|----------|
| NLLB-200 | 35+ | 翻訳 |
| MADLAD-400 | 400+ | レア言語 |
| Gemma 3 | 140+ | 汎用多言語 |
| Qwen 2.5 | 29+ | 中国語、アジア言語 |
| YandexGPT | RU/EN | ロシア語テキスト |
| GigaChat | RU/EN | ロシア語ナラティブ |
