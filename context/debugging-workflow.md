# MCP Debugging Workflow Guide

## Quick Start: 3-Step Debugging

### Step 1: Identify the Entity

- Order issue? Get orderId
- Driver issue? Get driverId
- User issue? Get userId

### Step 2: Run Diagnostic Tool

- Order: `wawapp_order_trace`
- Driver: `wawapp_driver_eligibility`

### Step 3: Deep Dive with Specialized Tools

Based on Step 2 results, use targeted tools from specific Kits

---

## Tool Selection Guide

### When to Use Each Kit

**Kit 1 (Order Lifecycle)**: Order-specific issues

- Tools: order_trace

**Kit 2 (Driver Matching)**: "Why can't driver see orders?"

- Tools: driver_eligibility, driver_view_orders

---

## Example Workflows

### Workflow 1: Driver Can't See Orders

```
1. wawapp_driver_eligibility → Check requirements
2. If location issue: Check driver_locations collection
3. If verification issue: Admin action required
4. If profile incomplete: Driver must complete onboarding
```

### Workflow 2: Order Investigation

```
1. wawapp_order_trace → Get full timeline
2. Check status transitions
3. Check completion time vs expected
```
