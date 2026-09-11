/** Logical image paths for recommendation cards, mirrored from W:\中转站推荐网页. */

export const recommendationImageCatalog: Record<string, string[]> = {
  "https://platform.agnes-ai.com": [
    "/images/agnes/pricing.webp",
    "/images/agnes/usage-overview.webp",
  ],
  "https://ai.xmiaom.com/sign-up?aff=bibi": [
    "/images/gugagu/models.webp",
    "/images/gugagu/models-gallery.webp",
    "/images/gugagu/profile.webp",
    "/images/gugagu/gallery.webp",
    "/images/gugagu/image-generation.webp",
    "/images/gugagu/generated-result.webp",
  ],
  "https://gorouter.app/sign-up?aff=biyq": [
    "/images/gorouter/models.webp",
    "/images/gorouter/usage.webp",
    "/images/gorouter/balance.webp",
    "/images/gorouter/usage-log.webp",
    "/images/gorouter/model-market.webp",
    "/images/gorouter/overview.webp",
  ],
  "https://windhub.cc/register?aff=o57s": [
    "/images/ark-api/register.webp",
    "/images/ark-api/checkin.webp",
    "/images/ark-api/pricing.webp",
    "/images/ark-api/pets.webp",
    "/images/ark-api/slots.webp",
    "/images/ark-api/market.webp",
    "/images/ark-api/rewards.webp",
    "/images/ark-api/product.webp",
  ],
  "https://anyrouter.top/register?aff=qnYH": [
    "/images/anyrouter/dashboard.webp",
    "/images/anyrouter/pricing.webp",
    "/images/anyrouter/models.webp",
    "/images/anyrouter/gemini.webp",
  ],
  "https://fufu.iqach.top/?mode=user": [
    "/images/mimo/login.webp",
    "/images/mimo/dashboard.webp",
  ],
  "https://keungliang.dpdns.org/sign-up?aff=qWHi": [
    "/images/new-cross/home.webp",
    "/images/new-cross/checkin.webp",
    "/images/new-cross/models.webp",
  ],
  "https://new.sharedchat.cc/list/#/register?i=9h0Gz": [
    "/images/sharedchat/dashboard.webp",
    "/images/sharedchat/usage.webp",
  ],
  "https://new-api.abrdns.com/register?aff=dtPa": [
    "/images/abrdns/checkin.webp",
    "/images/abrdns/models.webp",
    "/images/abrdns/status.webp",
    "/images/abrdns/status-detail.webp",
  ],
  "https://aihub.top/register?aff=7KDU2ZEAA5G9": [
    "/images/aihub/dashboard.webp",
    "/images/aihub/suppliers.webp",
    "/images/aihub/usage.webp",
    "/images/aihub/recent.webp",
  ],
  "https://ai.furry.edu.gr/register?aff=JQPNWTLR7R9T": [
    "/images/pawsai/channels-status.webp",
    "/images/pawsai/image-generation.webp",
    "/images/pawsai/infinite-canvas.webp",
    "/images/pawsai/top-up.webp",
    "/images/pawsai/available-channels.webp",
  ],
  "https://invite.linuxdo.org": [
    "/images/linuxdo/home.webp",
    "/images/linuxdo/resources.webp",
    "/images/linuxdo/charity.webp",
  ],
  "https://github.com/Allen-xxa/ComfyNexus": [
    "/images/comfynexus/screenshot-1.webp",
    "/images/comfynexus/screenshot-2.webp",
    "/images/comfynexus/screenshot-3.webp",
    "/images/comfynexus/screenshot-4.webp",
  ],
  "https://github.com/guliacer/ComfyUI-GuliNodes": [
    "/images/comfyui-gulinodes/screenshot-1.webp",
    "/images/comfyui-gulinodes/screenshot-2.webp",
    "/images/comfyui-gulinodes/screenshot-3.webp",
  ],
  "https://github.com/guliacer/GetPhoto": [
    "/images/getphoto/screenshot-1.webp",
    "/images/getphoto/screenshot-2.webp",
    "/images/getphoto/screenshot-3.webp",
    "/images/getphoto/screenshot-4.webp",
  ],
  "https://github.com/guliacer/PagePurifier": [
    "/images/pagepurifier/screenshot-1.webp",
    "/images/pagepurifier/screenshot-2.webp",
    "/images/pagepurifier/screenshot-3.webp",
    "/images/pagepurifier/screenshot-4.webp",
    "/images/pagepurifier/screenshot-5.webp",
  ],
  "https://github.com/guliacer/preview": [
    "/images/preview/screenshot-1.webp",
    "/images/preview/screenshot-2.webp",
    "/images/preview/screenshot-3.webp",
  ],
  "https://github.com/guliacer/VeilReader": [
    "/images/veilreader/screenshot-1.webp",
    "/images/veilreader/screenshot-2.webp",
    "/images/veilreader/screenshot-3.webp",
  ],
  "https://github.com/guliacer/cookclick": [
    "/images/cookclick/screenshot-1.webp",
  ],
  "https://github.com/guliacer/PixGo": [
    "/images/pixgo/screenshot-1.webp",
    "/images/pixgo/screenshot-2.webp",
    "/images/pixgo/screenshot-3.webp",
    "/images/pixgo/screenshot-4.webp",
    "/images/pixgo/screenshot-5.webp",
    "/images/pixgo/screenshot-6.webp",
    "/images/pixgo/screenshot-7.webp",
  ],
  "https://github.com/guliacer/news-html-digest": [
    "/images/news-html-digest/screenshot-1.webp",
    "/images/news-html-digest/screenshot-2.webp",
  ],
  "https://wisart.kuaileshifu.com/": [
    "/images/wisart/home.webp",
    "/images/wisart/works.webp",
    "/images/wisart/square.webp",
    "/images/wisart/game-1.webp",
    "/images/wisart/game-2.webp",
    "/images/wisart/checkin.webp",
  ],
};

export function getRecommendationImagePaths(url: string): string[] {
  return recommendationImageCatalog[url] ?? [];
}
