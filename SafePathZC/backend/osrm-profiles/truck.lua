-- Truck profile for OSRM
-- Based on car.lua but with restrictions for:
-- - Height limits
-- - Weight limits
-- - Narrow roads
-- - Residential areas

api_version = 4

Set = require('lib/set')
Sequence = require('lib/sequence')
Handlers = require("lib/way_handlers")
find_access_tag = require("lib/access").find_access_tag
limit = require("lib/maxspeed").limit
Measure = require("lib/measure")

function setup()
  return {
    properties = {
      max_speed_for_map_matching      = 180/3.6, -- 180kmph -> m/s
      weight_name                     = 'routability',
      process_call_tagless_node       = false,
      u_turn_penalty                  = 20,
      continue_straight_at_waypoint   = true,
      use_turn_restrictions           = true,
      left_hand_driving               = false,
      traffic_light_penalty           = 2,
    },

    default_mode            = mode.driving,
    default_speed           = 60,  -- Slower than cars (was 90)
    oneway_handling         = true,
    side_road_multiplier    = 0.8,
    turn_penalty            = 7.5,
    speed_reduction         = 0.8,

    -- Truck-specific: Prefer highways, avoid narrow residential streets
    highway_bonus           = 0.88, -- 14% faster on highways (strong preference)
    trunk_bonus             = 0.92, -- 9% faster on trunk roads
    primary_bonus           = 0.96, -- 4% faster on primary roads
    residential_penalty     = 1.4,  -- 40% slower on residential roads (balanced avoidance)
    service_road_penalty    = 1.6,  -- 60% slower on service roads (strong avoidance)
    tertiary_penalty        = 1.12, -- 12% slower on tertiary roads

    -- Size-based restrictions (in meters)
    max_height              = 4.0,  -- Default truck height limit
    max_width               = 2.5,  -- Default truck width limit
    max_length              = 18.0, -- Default truck length limit
    max_weight              = 26000, -- Default truck weight limit (kg)

    -- Speed limits based on road types (km/h)
    speeds = Sequence {
      highway = {
        motorway        = 90,  -- Reduced from car (110)
        motorway_link   = 45,  -- Reduced from car (50)
        trunk           = 85,  -- Reduced from car (110)
        trunk_link      = 40,  -- Reduced from car (50)
        primary         = 65,  -- Reduced from car (70)
        primary_link    = 30,  -- Reduced from car (50)
        secondary       = 55,  -- Reduced from car (70)
        secondary_link  = 25,  -- Reduced from car (50)
        tertiary        = 40,  -- Reduced from car (50)
        tertiary_link   = 20,  -- Reduced from car (30)
        unclassified    = 25,  -- Reduced from car (50)
        residential     = 20,  -- Much slower on residential (was 50)
        living_street   = 10,  -- Very slow (was 10)
        service         = 15,  -- Slow on service roads (was 30)
      }
    },

    -- Route selection based on accessibility
    route_speeds = Sequence {
      ferry = 5,
      shuttle_train = 10
    },

    bridge_speeds = Sequence {
      movable = 5
    },

    -- Penalize road types less suitable for trucks
    access_tag_whitelist = Set {
      'yes',
      'motorcar',
      'motor_vehicle',
      'vehicle',
      'permissive',
      'designated',
      'hgv',  -- Heavy goods vehicle
      'delivery'
    },

    access_tag_blacklist = Set {
      'no',
      'private',
      'agricultural',
      'forestry',
      'emergency',
      'psv',  -- Public service vehicle only
      'customers',
      'delivery'  -- Sometimes delivery vehicles only
    },

    restricted_access_tag_list = Set {
      'private',
      'delivery',
      'destination',
      'customers',
    },

    access_tags_hierarchy = Sequence {
      'motorcar',
      'motor_vehicle',
      'vehicle',
      'access',
      'hgv',
      'goods'
    },

    service_tag_restricted = Set {
      ['parking_aisle'] = true
    },

    restrictions = Sequence {
      'motorcar',
      'motor_vehicle',
      'vehicle',
      'hgv'
    },

    classes = Sequence {
        'toll', 'motorway', 'ferry', 'restricted', 'tunnel'
    },

    -- Exclude certain road types
    excludable = Sequence {
        Set {'toll'},
        Set {'motorway'},
        Set {'ferry'}
    },

    avoid = Set {
      'area',
      'toll_gantry',
      'turning_loop'
    },

    speeds = Sequence {
      highway = {
        motorway        = 90,
        motorway_link   = 45,
        trunk           = 85,
        trunk_link      = 40,
        primary         = 65,
        primary_link    = 30,
        secondary       = 55,
        secondary_link  = 25,
        tertiary        = 40,
        tertiary_link   = 20,
        unclassified    = 25,
        residential     = 20,
        living_street   = 10,
        service         = 15,
        track           = 5,
        path            = 0
      }
    },

    relation_types = Sequence {
      "route"
    },

    -- Truck-specific: weight and dimension restrictions
    suffix_list = Set {
      'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'North', 'South', 'East', 'West', 'Nor', 'Sou', 'Est', 'Ouest'
    },

    avoid = Set {
      'area',
      'toll_gantry',
      'turning_loop'
    },

    -- Duration penalties
    u_turn_penalty                  = 20,
    traffic_light_penalty           = 2,
    use_turn_restrictions           = true,
  }
end

function process_node(profile, node, result)
  -- Process barriers and restrictions
  local barrier = node:get_value_by_key("barrier")
  local access = find_access_tag(node, profile.access_tags_hierarchy)

  if barrier and barrier ~= "" then
    if profile.avoid[barrier] then
      result.barrier = true
    end
  end

  -- Traffic lights
  local highway = node:get_value_by_key("highway")
  if highway == "traffic_signals" then
    result.traffic_lights = true
  end
end

function process_way(profile, way, result)
  local data = {
    highway = way:get_value_by_key('highway'),
    bridge = way:get_value_by_key('bridge'),
    route = way:get_value_by_key('route'),
    duration = way:get_value_by_key('duration'),
    maxspeed = way:get_value_by_key('maxspeed'),
    maxheight = way:get_value_by_key('maxheight'),
    maxweight = way:get_value_by_key('maxweight'),
    maxwidth = way:get_value_by_key('maxwidth'),
    maxlength = way:get_value_by_key('maxlength'),
    width = way:get_value_by_key('width'),
    name = way:get_value_by_key('name'),
    oneway = way:get_value_by_key('oneway'),
    service = way:get_value_by_key('service'),
    area = way:get_value_by_key('area'),
  }

  -- Initial rejection based on area
  if data.area == "yes" then
    return
  end

  -- Check for truck restrictions
  local hgv = way:get_value_by_key('hgv')
  if hgv == 'no' or hgv == 'none' then
    return  -- Trucks not allowed
  end

  -- Check height restrictions
  if data.maxheight then
    local height = tonumber(data.maxheight)
    if height and height < profile.max_height then
      return  -- Height restricted
    end
  end

  -- Check weight restrictions
  if data.maxweight then
    local weight_str = data.maxweight:match("(%d+%.?%d*)")
    if weight_str then
      local weight = tonumber(weight_str) * 1000  -- Convert tons to kg
      if weight and weight < profile.max_weight then
        return  -- Weight restricted
      end
    end
  end

  -- Check width restrictions
  if data.maxwidth then
    local width = tonumber(data.maxwidth)
    if width and width < profile.max_width then
      return  -- Width restricted
    end
  end

  -- Check access
  local access = find_access_tag(way, profile.access_tags_hierarchy)
  if access and profile.access_tag_blacklist[access] then
    return
  end

  -- Get base speed from highway type
  local highway = data.highway
  if not highway or highway == '' then
    return
  end

  local speed = profile.speeds.highway[highway]
  if not speed then
    return  -- Unknown highway type
  end

  -- Apply bonuses for highways and main roads (trucks prefer these)
  if highway == 'motorway' or highway == 'motorway_link' then
    speed = speed / profile.highway_bonus  -- Faster (bonus = 0.8, so divide = speed up)
  elseif highway == 'trunk' or highway == 'trunk_link' then
    speed = speed / profile.trunk_bonus  -- Faster on trunk roads
  elseif highway == 'primary' or highway == 'primary_link' then
    speed = speed / profile.primary_bonus  -- Faster on primary roads
  elseif highway == 'tertiary' or highway == 'tertiary_link' then
    speed = speed / profile.tertiary_penalty  -- Slower on tertiary roads
  elseif highway == 'residential' or highway == 'living_street' then
    speed = speed / profile.residential_penalty  -- Much slower on residential
  elseif highway == 'service' or data.service then
    speed = speed / profile.service_road_penalty  -- Very slow on service roads
  end

  -- Oneway handling
  local oneway = data.oneway
  if oneway == 'yes' or oneway == '1' or oneway == 'true' then
    result.forward_mode = mode.driving
    result.backward_mode = mode.inaccessible
  elseif oneway == '-1' then
    result.forward_mode = mode.inaccessible
    result.backward_mode = mode.driving
  else
    result.forward_mode = mode.driving
    result.backward_mode = mode.driving
  end

  -- Set speeds
  if data.maxspeed then
    local max = tonumber(data.maxspeed)
    if max then
      speed = math.min(speed, max)
    end
  end

  result.forward_speed = speed
  result.backward_speed = speed
  result.forward_rate = speed
  result.backward_rate = speed

  -- Classes (for exclusions)
  if highway == 'motorway' or highway == 'motorway_link' then
    result.forward_classes['motorway'] = true
    result.backward_classes['motorway'] = true
  end

  if data.bridge and data.bridge == 'yes' then
    result.forward_classes['bridge'] = true
    result.backward_classes['bridge'] = true
  end

  -- Name
  if data.name then
    result.name = data.name
  end
end

return {
  setup = setup,
  process_way = process_way,
  process_node = process_node,
  process_turn = function(profile, turn) 
    turn.duration = 0.
    if turn.direction_modifier == "uturn" then
       turn.duration = turn.duration + profile.properties.u_turn_penalty
    end
    if turn.has_traffic_light then
       turn.duration = turn.duration + profile.properties.traffic_light_penalty
    end
  end
}
