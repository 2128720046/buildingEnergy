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
  videoBg: '/images/背景/d3e3a8e5-28f4-4dcc-865d-1cb1fedaee3033261.mp4',
  videoBgFallback: '/images/背景/51739eaa-7445-41f7-956a-44f674fbfda325255.mp4',

  cardFrameLarge: '/images/科技感边框/256727e7023fffa775402f670b106cbeba5fb85216ad6-6P63yF_fw658webp.webp',
  cardFrameMedium: '/images/科技感边框/4783dceb87f55ada5adabdf709e8e61e6d9f6bbd5b81-K41gCT_fw658webp.webp',
  cardFrameSmall: '/images/科技感边框/4d3a76f4ba88b24e63e6d6ce0bf81840ee15588a187a93-9v1W6c_fw658webp.webp',
  cardFrameKpi: '/images/科技感边框/55fd9588489a16258a83b1f5fb41304cdd55da6c9163-78JVhg_fw658webp.webp',
  cardFrameAlt1: '/images/科技感边框/70803fb41827bcf08afd7db784912a2150f2135f6208-89BRth_fw658webp.webp',
  cardFrameAlt2: '/images/科技感边框/84774ba019e95b2d77d7cf6082c65e121b81d5cc1160d-bsbtzP_fw658webp.webp',
  cardFrameAlt3: '/images/科技感边框/8f87da0baa09be090c99589de95fc183a3400ca93ccef-UtweaW_fw658webp.webp',
  cardFrameAlt4: '/images/科技感边框/aa5fa66cb4da0edacd7e6556f2d6ccdf049fcd4c3cb4-mV1luZ_fw658webp.webp',
  cardFrameAlt5: '/images/科技感边框/c2ee57be67ba8d766ce0329597a92f448c93c646129c9-gBUlJd_fw658webp.webp',
  cardFrameAlt6: '/images/科技感边框/ec407c3e666862fa1007f5f22e48be07db52405e3416-BkSxAz_fw658webp.webp',

  cornerDecor1: '/images/四角直角装饰/cf472905f18a981d89429581061a343f7e20411b1f85-cIcf8t_fw658webp.webp',
  cornerDecor2: '/images/四角直角装饰/dfb1ad6ab5a680720e750db3e5a3938d796cbcfb102c7-dwrXvR_fw658webp.webp',

  divider1: '/images/分割线/217cb6997428763688f6428011281ac670cd08791544e-6m2MIn_fw658webp.webp',
  divider2: '/images/分割线/a417d172d08ccc8874e01d4e7ad80e910d99516029ad-T0oP58_fw658webp.webp',
  divider3: '/images/分割线/b480c76df094ce8fc270b17e48585c468984652677f7d-KXO3Bu_fw658webp.webp',
  divider4: '/images/分割线/ba5821b3fdf810ad852643c0f2a10ab1008da730c996-JxIzhL_fw658webp.webp',
  divider5: '/images/分割线/cfab8ce2dee1ad1e8f91c28515fa7b4e24722d31e245bb-IuBpUO_fw658webp.webp',
  divider6: '/images/分割线/fe09620a9baee2271c2215a85edaa7023d04c40173c5-azluJd_fw658webp.webp',

  pageTitle: '/images/标题.png',
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
