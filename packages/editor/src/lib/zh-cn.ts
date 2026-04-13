const NAME_TRANSLATIONS: Record<string, string> = {
  Building: '建筑',
  Wall: '墙体',
  Window: '窗户',
  Door: '门',
  Item: '组件',
  'Dining room': '餐厅',
  Entrance: '入口',
  'Garage 1': '车库 1',
  'Garage 2': '车库 2',
  'Guest bathroom': '客用卫生间',
  'Guest bedroom': '客卧',
  Kicthen: '厨房',
  'Kid bathroom': '儿童卫生间',
  'Kid bedroom 1': '儿童卧室 1',
  'Kid bedroom 2': '儿童卧室 2',
  Lanai: '露台',
  'Laundry room': '洗衣房',
  'Living room': '客厅',
  'Master bathroom': '主卫',
  'Master bedroom': '主卧',
  'Master closet': '主衣帽间',
  Office: '办公室',
  Pool: '泳池',
  'Ceiling Lamp': '吸顶灯',
  'Dining Chair': '餐椅',
  'Dining Table': '餐桌',
  Dresser: '斗柜',
  'Small Plant': '小型绿植',
  Fridge: '冰箱',
  'Barbell Stand': '杠铃架',
  'Ceiling fan': '吊扇',
  'Double Bed': '双人床',
  'Office Chair': '办公椅',
  'Office Table': '办公桌',
  Kitchen: '整体厨房',
  'Kitchen Cabinet': '厨房吊柜',
  'Recessed Light': '筒灯',
  Stove: '炉灶',
  'Floor Lamp': '落地灯',
  'Round Carpet': '圆形地毯',
  'Coffee Table': '茶几',
  'Door 3': '门 3',
  Sofa: '沙发',
  'Electric Panel': '配电箱',
  'Ev-wall-charger': '壁挂充电器',
  Hood: '抽油烟机',
  'Indoor Plant': '室内绿植',
  'Kitchen Shelf': '厨房置物架',
  'Lounge Chair': '休闲椅',
  'Table Lamp': '台灯',
  Thermostat: '温控器',
  Toilet: '马桶',
  'Bedside Table': '床头柜',
  Closet: '衣柜',
  'Coat Rack': '衣帽架',
  Tesla: '特斯拉',
  Pillar: '柱体',
  'High Fence': '高围栏',
  'Medium Fence': '中围栏',
  'Low Fence': '低围栏',
  Bush: '灌木',
  Fir: '冷杉',
  Tree: '树木',
  Palm: '棕榈树',
  'Patio Umbrella': '庭院遮阳伞',
  Sunbed: '躺椅',
  'Double Window': '双扇窗',
  'Simple Window': '单扇窗',
  'Rectangle Window': '长窗',
  'Door with bar': '带横杆门',
  'Glass Door': '玻璃门',
}

const TAG_TRANSLATIONS: Record<string, string> = {
  All: '全部',
  floor: '地面',
  wall: '墙面',
  ceiling: '天花',
  countertop: '台面',
  garage: '车库',
  structure: '结构',
  fencing: '围栏',
  vegetation: '绿植',
  leisure: '休闲',
  seating: '座椅',
  appliance: '电器',
  furniture: '家具',
  kitchen: '厨房',
  bathroom: '卫浴',
  outdoor: '户外',
  door: '门',
  window: '窗',
}

export function localizeTag(tag: string): string {
  return TAG_TRANSLATIONS[tag] ?? tag
}

export function localizeDisplayName(value: string, type?: string): string {
  const trimmed = value.trim()
  if (!trimmed) return value

  if (NAME_TRANSLATIONS[trimmed]) {
    return NAME_TRANSLATIONS[trimmed]
  }

  const levelMatch = trimmed.match(/^Level\s+(\d+)$/i)
  if (levelMatch?.[1]) {
    return `楼层 ${levelMatch[1]}`
  }

  const zoneMatch = trimmed.match(/^Zone\s*\((.+)\)$/i)
  if (zoneMatch?.[1]) {
    return `分区 (${zoneMatch[1]})`
  }

  const slabMatch = trimmed.match(/^Slab\s*\((.+)\)$/i)
  if (slabMatch?.[1]) {
    return `楼板 (${slabMatch[1]})`
  }

  const ceilingMatch = trimmed.match(/^Ceiling\s*\((.+)\)$/i)
  if (ceilingMatch?.[1]) {
    return `天花板 (${ceilingMatch[1]})`
  }

  const roofMatch = trimmed.match(/^Roof\s*\((\d+)\s+segments?\)$/i)
  if (roofMatch?.[1]) {
    return `屋顶 (${roofMatch[1]} 段)`
  }

  const stairMatch = trimmed.match(/^Staircase\s*\((\d+)\s+segments?\)$/i)
  if (stairMatch?.[1]) {
    return `楼梯 (${stairMatch[1]} 段)`
  }

  if (type === 'door' || /^door_/i.test(trimmed)) {
    return '门'
  }

  if (type === 'window' || /^window_/i.test(trimmed)) {
    return '窗户'
  }

  return trimmed
}