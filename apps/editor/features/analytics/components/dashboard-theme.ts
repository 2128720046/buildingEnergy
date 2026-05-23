export const DASHBOARD_COLORS = {
  bgDeep: '#020817',
  bgMid: '#061829',
  bgPanel: '#0A2540',
  bgPanelSoft: 'rgba(10, 37, 64, 0.55)',

  primary: '#00D4FF',
  primaryDim: '#0088B3',
  primarySoft: 'rgba(0, 212, 255, 0.15)',

  amber: '#FFB800',
  emerald: '#22D3A0',
  rose: '#FF4D6D',
  violet: '#7C5CFF',

  textPrimary: '#E8F4FF',
  textSecondary: '#8DA8C5',
  textMuted: '#5A7595',
  textOnBright: '#020817',

  borderStrong: '#1E3A5F',
  borderSoft: 'rgba(0, 212, 255, 0.2)',
  borderDim: 'rgba(0, 212, 255, 0.08)',

  series: ['#00D4FF', '#FFB800', '#22D3A0', '#7C5CFF', '#FF6B9B'],
} as const

export const DASHBOARD_ASSETS = {
  videoBg: '/images/背景/f0eae8eb-a117-46f0-b742-db44dc705b1446161.mp4',
  videoBgFallback: '/images/背景/f0eae8eb-a117-46f0-b742-db44dc705b1446161.mp4',

  cardFrameLarge:
    '/images/科技边框/b6c8f06643defac557e84125e46a0f7acd8751f016f97-ZKx4Zc_fw658webp.webp',
  cardFrameMedium:
    '/images/科技边框/b028713a539ad89dc3450ee77951e19358260537274ea-3Bk7pK_fw658webp.webp',
  cardFrameSmall:
    '/images/科技边框/70803fb41827bcf08afd7db784912a2150f2135f6208-89BRth_fw658webp.webp',
  cardFrameKpi:
    '/images/科技边框/256727e7023fffa775402f670b106cbeba5fb85216ad6-6P63yF_fw658webp.webp',
  cardFrameAlt1:
    '/images/科技边框/70803fb41827bcf08afd7db784912a2150f2135f6208-89BRth_fw658webp.webp',
  cardFrameAlt2:
    '/images/科技边框/84774ba019e95b2d77d7cf6082c65e121b81d5cc1160d-bsbtzP_fw658webp.webp',
  cardFrameAlt3:
    '/images/科技边框/906ddb0724c2d9ab5d926551640dacf8df2983ac1bce7-L5WStw_fw658webp.webp',
  cardFrameAlt4:
    '/images/科技边框/a30d5dd1c4674a3fb84f8eab03f760339682fb5b5975-PqUmZG_fw658webp.webp',
  cardFrameAlt5:
    '/images/科技边框/c2ee57be67ba8d766ce0329597a92f448c93c646129c9-gBUlJd_fw658webp.webp',
  cardFrameAlt6:
    '/images/科技边框/dc8f71ef563fe81fe3efe177765198b22ccf49e060dc-n8XCec_fw658webp.webp',

  cornerDecor1:
    '/images/四角装饰/dfb1ad6ab5a680720e750db3e5a3938d796cbcfb102c7-dwrXvR_fw658webp.webp',
  cornerDecor2:
    '/images/四角装饰/dfb1ad6ab5a680720e750db3e5a3938d796cbcfb102c7-dwrXvR_fw658webp.webp',

  divider1: '/images/分割线/17eadd6f5c87217135624e512032da3e9633105422ea5-SIWse4_fw658webp.webp',
  divider2: '/images/分割线/1b2fbf162f1dc877204f16cc063549264c41b1234f5a-LL6Nog_fw658webp.webp',
  divider3: '/images/分割线/827c9699375253ced0f7d42cea166241d81cfabbbbbeaa-l4oi5D_fw658webp.webp',
  divider4: '/images/分割线/cfab8ce2dee1ad1e8f91c28515fa7b4e24722d31e245bb-IuBpUO_fw658webp.webp',
  divider5: '/images/分割线/cfab8ce2dee1ad1e8f91c28515fa7b4e24722d31e245bb-IuBpUO_fw658webp.webp',
  divider6: '/images/分割线/fe09620a9baee2271c2215a85edaa7023d04c40173c5-azluJd_fw658webp.webp',

  pageTitle: '/顶部标题.png',
} as const

export const DASHBOARD_FONTS = {
  cn: 'var(--font-puhuiti)',
  num: 'var(--font-rajdhani)',
  numHeavy: 'var(--font-dinpro)',
} as const

export type CardSize = 'small' | 'medium' | 'large' | 'kpi'

export const CARD_FRAME_BY_SIZE: Record<CardSize, string> = {
  small: DASHBOARD_ASSETS.cardFrameSmall,
  medium: DASHBOARD_ASSETS.cardFrameMedium,
  large: DASHBOARD_ASSETS.cardFrameLarge,
  kpi: DASHBOARD_ASSETS.cardFrameKpi,
}
