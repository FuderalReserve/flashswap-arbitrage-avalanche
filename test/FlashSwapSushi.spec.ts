import { BigNumber, Contract } from "ethers";
import { network, getNamedAccounts, ethers } from "hardhat";

import {
  expandTo18Decimals,
  bigNumberToNumber,
  isLocalEnv,
} from "../shared/utilities";
import { expect } from "chai";
import setupTest from "./test-fixture";

describe("FlashSwapSushiPango", () => {
  let FlashSwapSushiPango: Contract;
  let Wavax: Contract;
  let Usdt: Contract;
  let PangoWavaxUsdt: Contract;
  let SushiSwapWavaxUsdt: Contract;
  let gasPrice: BigNumber;
  let estimatedGas: BigNumber;

  beforeEach(async () => {
    if (isLocalEnv(network.name)) {
      const {
        WAVAX,
        USDT,
        PANGO_WAVAX_USDT_PAIR,
        UNISWAP_WAVAX_USDT_PAIR,
        FLASH_SWAP_SUSHI,
      } = await setupTest();
      Wavax = WAVAX;
      Usdt = USDT;
      PangoWavaxUsdt = PANGO_WAVAX_USDT_PAIR;
      SushiSwapWavaxUsdt = UNISWAP_WAVAX_USDT_PAIR;
      FlashSwapSushiPango = FLASH_SWAP_SUSHI;
    }
  });

  it("should send user 69 USDT", async function () {
    const { deployer, user } = await getNamedAccounts();

    // add liquidity to Pango at a rate of 1 AVAX / 200 X
    let USTDAmount = expandTo18Decimals(2000);
    let WavaxAmount = expandTo18Decimals(10);
    await Usdt.mint(deployer, USTDAmount);
    await Usdt.transfer(PangoWavaxUsdt.address, USTDAmount);

    await Wavax.mint(deployer, WavaxAmount);
    await Wavax.transfer(PangoWavaxUsdt.address, WavaxAmount);
    await PangoWavaxUsdt.mint(deployer);

    // add liquidity to Sushi at a rate of 1 AVAX / 100 X
    USTDAmount = expandTo18Decimals(1000);
    WavaxAmount = expandTo18Decimals(10);
    await Usdt.mint(deployer, USTDAmount);
    await Usdt.transfer(SushiSwapWavaxUsdt.address, USTDAmount);

    await Wavax.mint(deployer, WavaxAmount);
    await Wavax.transfer(SushiSwapWavaxUsdt.address, WavaxAmount);
    await SushiSwapWavaxUsdt.mint(deployer);

    const balanceBefore = await Usdt.balanceOf(user);

    // now, execute arbitrage via pango:
    // receive 1 AVAX from Pango, get as much USDT from Sushi as we can, repay Pango with minimum USDT, keep the rest!
    const arbitrageAmount = expandTo18Decimals(1);

    // Fgure out which token is which
    const SushiPairToken0 = await SushiSwapWavaxUsdt.token0();
    // If token0 is USDT then set amount0 to  0 else set its value to 1 since its WAVAX
    const amount0 =
      SushiPairToken0 === Usdt.address
        ? expandTo18Decimals(0)
        : arbitrageAmount;
    // If token0 is USDT then set amount1 to 1 else set its value to 0 since its USDT
    const amount1 =
      SushiPairToken0 === Usdt.address
        ? arbitrageAmount
        : expandTo18Decimals(0);

    // Swap 1 AVAX for USDT
    await SushiSwapWavaxUsdt.swap(
      amount0,
      amount1,
      FlashSwapSushiPango.address,
      ethers.utils.toUtf8Bytes("1")
    );

    estimatedGas = await SushiSwapWavaxUsdt.estimateGas.swap(
      amount0,
      amount1,
      FlashSwapSushiPango.address,
      ethers.utils.toUtf8Bytes("1")
    );

    // The gas price (in wei)...
    gasPrice = await ethers.provider.getGasPrice();
    let gasCost = gasPrice.mul(estimatedGas);
    gasCost = gasCost.add(gasCost.div(BigNumber.from("30")));
    console.log("Formated gas", ethers.utils.formatUnits(estimatedGas));
    // Converts gas price from wei to eth
    console.log("Formated gas price", ethers.utils.formatUnits(gasPrice));
    console.log("Formated gas cost", ethers.utils.formatUnits(gasCost));

    console.log("Estimated gas price", gasPrice.toNumber());
    console.log("Estimated Gas", estimatedGas.toNumber());
    console.log("Estimated gas cost", gasCost.toNumber());

    const balanceAfter = await Usdt.balanceOf(user);

    // Get Profit
    const profit = balanceAfter.sub(balanceBefore).div(expandTo18Decimals(1));

    // Check sushi pair price
    let sushiReserves = await SushiSwapWavaxUsdt.getReserves();
    let priceSushi =
      SushiPairToken0 === Usdt.address
        ? sushiReserves[0].div(sushiReserves[1])
        : sushiReserves[1].div(sushiReserves[0]);

    // Check pango pair price
    let pangoReserves = await PangoWavaxUsdt.getReserves();
    let pricePango =
      SushiPairToken0 === Usdt.address
        ? pangoReserves[0].div(pangoReserves[1])
        : pangoReserves[1].div(pangoReserves[0]);

    expect(profit.toString()).to.eq("69"); // our profit is ~69 tokens
    expect(pricePango.toString()).to.eq("165"); // we pushed the sushi price down to ~165
    expect(priceSushi.toString()).to.eq("123"); // we pushed the pango price up to ~123
  });

  it("should send user .5 WAVAX", async function () {
    const { deployer, user } = await getNamedAccounts();

    // add liquidity to Pango at a rate of 1 AVAX / 100 X
    const USDTUniswapAmount = expandTo18Decimals(1000);
    const AvaxSushiSwapAmount = expandTo18Decimals(10);
    await Usdt.mint(deployer, USDTUniswapAmount);
    await Usdt.transfer(PangoWavaxUsdt.address, USDTUniswapAmount);

    await Wavax.mint(deployer, AvaxSushiSwapAmount);
    await Wavax.transfer(PangoWavaxUsdt.address, AvaxSushiSwapAmount);
    await PangoWavaxUsdt.mint(deployer);

    // add liquidity to Sushi at a rate of 1 AVAX / 200 X
    const USDTPangoAmount = expandTo18Decimals(2000);
    const AvaxPangoAmount = expandTo18Decimals(10);
    await Usdt.mint(deployer, USDTPangoAmount);
    await Usdt.transfer(SushiSwapWavaxUsdt.address, USDTPangoAmount);

    await Wavax.mint(deployer, AvaxPangoAmount);
    await Wavax.transfer(SushiSwapWavaxUsdt.address, AvaxPangoAmount);
    await SushiSwapWavaxUsdt.mint(deployer);

    const balanceBefore = await Wavax.balanceOf(user);

    // now, execute arbitrage via pango:
    // receive 200 USDT from Pango, get as much WAVAX from Sushi as we can, repay Pango with minimum AVAX, keep the rest!
    const arbitrageAmount = expandTo18Decimals(200);

    // Fgure out which token is which
    const SushiPairToken0 = await SushiSwapWavaxUsdt.token0();
    // If token0 is USDT then set amount0 to  0 else set its value to 1 since its WAVAX
    const amount0 =
      SushiPairToken0 === Usdt.address
        ? arbitrageAmount
        : expandTo18Decimals(0);

    // If token0 is USDT then set amount1 to 1 else set its value to 0 since its USDT
    const amount1 =
      SushiPairToken0 === Usdt.address
        ? expandTo18Decimals(0)
        : arbitrageAmount;

    // Swap 200 USDT for AVAX
    await SushiSwapWavaxUsdt.swap(
      amount0,
      amount1,
      FlashSwapSushiPango.address,
      ethers.utils.toUtf8Bytes("1")
    );

    const balanceAfter = await Wavax.balanceOf(user);

    // Get Profit
    const profit = balanceAfter.sub(balanceBefore);

    // Check sushi pair price
    let sushiReserves = await SushiSwapWavaxUsdt.getReserves();
    let priceSushi =
      SushiPairToken0 === Usdt.address
        ? sushiReserves[0].div(sushiReserves[1])
        : sushiReserves[1].div(sushiReserves[0]);

    // Check pango pair price
    let pangoReserves = await PangoWavaxUsdt.getReserves();
    let pricePango =
      SushiPairToken0 === Usdt.address
        ? pangoReserves[0].div(pangoReserves[1])
        : pangoReserves[1].div(pangoReserves[0]);

    expect(bigNumberToNumber(profit)).to.eq(0.548043441089763649); // our profit is ~.5 ETH
    expect(pricePango.toString()).to.eq("143"); // we pushed the sushi price up to ~143
    expect(priceSushi.toString()).to.eq("161"); // we pushed the pango price down to ~161
  });
});
