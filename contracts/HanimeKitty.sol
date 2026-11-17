// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// Fixed supply: everything is minted once to the deployer. No owner, no mint function,
/// so nobody can ever create more tokens.
contract HanimeKitty is ERC20, ERC20Burnable {
    uint256 public constant MAX_SUPPLY = 1_000 * 10 ** 18;

    constructor() ERC20("Hanime Kitty", "HTV") {
        _mint(msg.sender, MAX_SUPPLY);
    }
}
